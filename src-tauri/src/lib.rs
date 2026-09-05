use std::{
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::Manager;

const DATABASE_FILE: &str = "database.dpapi";
const DATABASE_BACKUP_FILE: &str = "database.dpapi.bak";
const DATABASE_TEMP_FILE: &str = "database.dpapi.tmp";
const AUTOMATIC_BACKUP_DIR: &str = "automatic-backups";
const AUTOMATIC_BACKUP_PREFIX: &str = "daily-";
const AUTOMATIC_BACKUP_SUFFIX: &str = ".dpapi";
const AUTOMATIC_BACKUP_RETENTION: usize = 30;
const MAX_DATABASE_BYTES: usize = 64 * 1024 * 1024;
const SECONDS_PER_DAY: u64 = 86_400;

fn data_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Não foi possível localizar a pasta segura do AulaFácil: {error}"))?;

    fs::create_dir_all(&directory)
        .map_err(|error| format!("Não foi possível preparar a pasta segura do AulaFácil: {error}"))?;

    Ok(directory)
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_directory(app)?.join(DATABASE_FILE))
}

fn database_backup_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_directory(app)?.join(DATABASE_BACKUP_FILE))
}

fn database_temp_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_directory(app)?.join(DATABASE_TEMP_FILE))
}

fn automatic_backup_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = data_directory(app)?.join(AUTOMATIC_BACKUP_DIR);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Não foi possível preparar a pasta de backups automáticos: {error}"))?;
    Ok(directory)
}

fn current_day_key() -> Result<u64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "O relógio do computador possui uma data inválida para o backup automático.".to_string())?;
    Ok(duration.as_secs() / SECONDS_PER_DAY)
}

fn automatic_backup_name(day: u64) -> String {
    format!("{AUTOMATIC_BACKUP_PREFIX}{day:010}{AUTOMATIC_BACKUP_SUFFIX}")
}

fn automatic_backup_day(name: &str) -> Option<u64> {
    let value = name
        .strip_prefix(AUTOMATIC_BACKUP_PREFIX)?
        .strip_suffix(AUTOMATIC_BACKUP_SUFFIX)?;
    if value.len() != 10 || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    value.parse().ok()
}

fn automatic_backup_files(app: &tauri::AppHandle) -> Result<Vec<(u64, PathBuf)>, String> {
    let directory = automatic_backup_directory(app)?;
    let entries = fs::read_dir(&directory)
        .map_err(|error| format!("Não foi possível consultar os backups automáticos: {error}"))?;
    let mut files = Vec::new();

    for entry in entries {
        let entry = entry
            .map_err(|error| format!("Não foi possível ler um backup automático: {error}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if let Some(day) = automatic_backup_day(&name) {
            files.push((day, path));
        }
    }

    files.sort_by_key(|(day, _)| *day);
    Ok(files)
}

fn create_daily_automatic_backup(app: &tauri::AppHandle, primary: &Path) -> Result<(), String> {
    let directory = automatic_backup_directory(app)?;
    let target = directory.join(automatic_backup_name(current_day_key()?));

    if !target.exists() {
        fs::copy(primary, &target)
            .map_err(|error| format!("Não foi possível criar o backup automático do dia: {error}"))?;
        let backup_file = OpenOptions::new()
            .read(true)
            .open(&target)
            .map_err(|error| format!("Não foi possível confirmar o backup automático: {error}"))?;
        backup_file
            .sync_all()
            .map_err(|error| format!("Não foi possível confirmar o backup automático no disco: {error}"))?;
    }

    let mut files = automatic_backup_files(app)?;
    if files.len() > AUTOMATIC_BACKUP_RETENTION {
        let remove_count = files.len() - AUTOMATIC_BACKUP_RETENTION;
        for (_, path) in files.drain(..remove_count) {
            fs::remove_file(path)
                .map_err(|error| format!("Não foi possível remover um backup automático antigo: {error}"))?;
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn protect_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    use std::{ptr, slice};
    use winapi::um::{
        dpapi::{CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN},
        winbase::LocalFree,
        wincrypt::DATA_BLOB,
    };

    let size = u32::try_from(data.len())
        .map_err(|_| "Banco de dados grande demais para ser protegido.".to_string())?;
    let mut input = DATA_BLOB {
        cbData: size,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = DATA_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };

    let success = unsafe {
        CryptProtectData(
            &mut input,
            ptr::null(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };

    if success == 0 {
        return Err(format!(
            "O Windows não conseguiu criptografar os dados: {}",
            std::io::Error::last_os_error()
        ));
    }

    let protected = unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as *mut _);
    }
    Ok(protected)
}

#[cfg(target_os = "windows")]
fn unprotect_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    use std::{ptr, slice};
    use winapi::um::{
        dpapi::{CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN},
        winbase::LocalFree,
        wincrypt::DATA_BLOB,
    };

    let size = u32::try_from(data.len())
        .map_err(|_| "Banco protegido inválido.".to_string())?;
    let mut input = DATA_BLOB {
        cbData: size,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = DATA_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };

    let success = unsafe {
        CryptUnprotectData(
            &mut input,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };

    if success == 0 {
        return Err(format!(
            "O Windows não conseguiu descriptografar os dados. O arquivo pode ter sido alterado, corrompido ou pertencer a outro usuário: {}",
            std::io::Error::last_os_error()
        ));
    }

    let plain = unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as *mut _);
    }
    Ok(plain)
}

#[cfg(not(target_os = "windows"))]
fn protect_bytes(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("O armazenamento protegido desta versão está disponível somente no Windows.".to_string())
}

#[cfg(not(target_os = "windows"))]
fn unprotect_bytes(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("O armazenamento protegido desta versão está disponível somente no Windows.".to_string())
}

fn load_protected_file(path: &Path) -> Result<Option<String>, String> {
    let encrypted = match fs::read(path) {
        Ok(content) => content,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Não foi possível ler o banco protegido: {error}")),
    };

    if encrypted.len() > MAX_DATABASE_BYTES {
        return Err("O banco protegido excede o limite de segurança permitido.".to_string());
    }

    let plain = unprotect_bytes(&encrypted)?;
    String::from_utf8(plain)
        .map(Some)
        .map_err(|_| "O banco protegido não contém dados válidos em UTF-8.".to_string())
}

fn load_latest_automatic_backup(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let files = automatic_backup_files(app)?;
    let mut failures = Vec::new();

    for (_, path) in files.into_iter().rev() {
        match load_protected_file(&path) {
            Ok(Some(content)) => return Ok(Some(content)),
            Ok(None) => {}
            Err(error) => failures.push(error),
        }
    }

    if failures.is_empty() {
        Ok(None)
    } else {
        Err(format!(
            "Nenhum dos backups automáticos disponíveis pôde ser aberto. {}",
            failures.join(" ")
        ))
    }
}

#[tauri::command]
fn secure_storage_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let primary = database_path(&app)?;
    let backup = database_backup_path(&app)?;
    let mut failures = Vec::new();

    match load_protected_file(&primary) {
        Ok(Some(content)) => return Ok(Some(content)),
        Ok(None) => {}
        Err(error) => failures.push(format!("Banco principal: {error}")),
    }

    match load_protected_file(&backup) {
        Ok(Some(content)) => return Ok(Some(content)),
        Ok(None) => {}
        Err(error) => failures.push(format!("Cópia de recuperação: {error}")),
    }

    match load_latest_automatic_backup(&app) {
        Ok(Some(content)) => Ok(Some(content)),
        Ok(None) if failures.is_empty() => Ok(None),
        Ok(None) => Err(format!(
            "O AulaFácil não encontrou uma cópia válida para recuperar os dados. {}",
            failures.join(" ")
        )),
        Err(error) => {
            failures.push(format!("Backups automáticos: {error}"));
            Err(format!(
                "O banco principal e todas as cópias de recuperação falharam. {}",
                failures.join(" ")
            ))
        }
    }
}

#[tauri::command]
fn secure_storage_save(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    if payload.len() > MAX_DATABASE_BYTES {
        return Err("O banco de dados excede o limite de segurança permitido.".to_string());
    }

    let primary = database_path(&app)?;
    let backup = database_backup_path(&app)?;
    let temporary = database_temp_path(&app)?;
    let encrypted = protect_bytes(payload.as_bytes())?;

    let mut temp_file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temporary)
        .map_err(|error| format!("Não foi possível preparar a gravação segura: {error}"))?;

    temp_file
        .write_all(&encrypted)
        .map_err(|error| format!("Não foi possível gravar a cópia temporária: {error}"))?;
    temp_file
        .sync_all()
        .map_err(|error| format!("Não foi possível confirmar a gravação no disco: {error}"))?;
    drop(temp_file);

    if primary.exists() {
        fs::copy(&primary, &backup)
            .map_err(|error| format!("Não foi possível criar a cópia de recuperação antes de salvar: {error}"))?;
        fs::remove_file(&primary)
            .map_err(|error| format!("Não foi possível substituir o banco protegido atual: {error}"))?;
    }

    if let Err(error) = fs::rename(&temporary, &primary) {
        if backup.exists() && !primary.exists() {
            let _ = fs::copy(&backup, &primary);
        }
        return Err(format!("Não foi possível concluir a gravação protegida: {error}"));
    }

    if let Err(error) = create_daily_automatic_backup(&app, &primary) {
        eprintln!("Falha ao atualizar os backups automáticos do AulaFácil: {error}");
    }

    Ok(())
}

#[tauri::command]
fn secure_storage_clear(app: tauri::AppHandle) -> Result<(), String> {
    for path in [
        database_path(&app)?,
        database_backup_path(&app)?,
        database_temp_path(&app)?,
    ] {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Não foi possível remover o banco protegido: {error}")),
        }
    }

    let automatic = automatic_backup_directory(&app)?;
    match fs::remove_dir_all(automatic) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Não foi possível remover os backups automáticos: {error}")),
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            secure_storage_load,
            secure_storage_save,
            secure_storage_clear
        ])
        .run(tauri::generate_context!())
        .expect("não foi possível iniciar o AulaFácil");
}

use std::{
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
};

use tauri::Manager;

const DATABASE_FILE: &str = "database.dpapi";
const DATABASE_BACKUP_FILE: &str = "database.dpapi.bak";
const DATABASE_TEMP_FILE: &str = "database.dpapi.tmp";
const MAX_DATABASE_BYTES: usize = 64 * 1024 * 1024;

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
        .map_err(|_| "Banco de dados protegido inválido.".to_string())?;
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

#[tauri::command]
fn secure_storage_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let primary = database_path(&app)?;
    let backup = database_backup_path(&app)?;

    match load_protected_file(&primary) {
        Ok(Some(content)) => Ok(Some(content)),
        Ok(None) => load_protected_file(&backup),
        Err(primary_error) => match load_protected_file(&backup) {
            Ok(Some(content)) => Ok(Some(content)),
            Ok(None) => Err(primary_error),
            Err(backup_error) => Err(format!(
                "O banco principal e a cópia de recuperação não puderam ser abertos. Principal: {primary_error} Recuperação: {backup_error}"
            )),
        },
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

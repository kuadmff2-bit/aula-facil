use std::{fs, io::ErrorKind, path::PathBuf};

use tauri::Manager;

const DATABASE_FILE: &str = "database.dpapi";
const MAX_DATABASE_BYTES: usize = 64 * 1024 * 1024;

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Não foi possível localizar a pasta segura do AulaFácil: {error}"))?;

    fs::create_dir_all(&directory)
        .map_err(|error| format!("Não foi possível preparar a pasta segura do AulaFácil: {error}"))?;

    Ok(directory.join(DATABASE_FILE))
}

#[cfg(target_os = "windows")]
fn protect_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    use std::{ptr, slice};
    use winapi::um::{
        dpapi::{CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN},
        winbase::LocalFree,
        wincrypt::DATA_BLOB,
    };

    let size = u32::try_from(data.len()).map_err(|_| "Banco de dados grande demais para ser protegido.".to_string())?;
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

    let size = u32::try_from(data.len()).map_err(|_| "Banco de dados protegido inválido.".to_string())?;
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

#[tauri::command]
fn secure_storage_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = database_path(&app)?;
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
fn secure_storage_save(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    if payload.len() > MAX_DATABASE_BYTES {
        return Err("O banco de dados excede o limite de segurança permitido.".to_string());
    }

    let path = database_path(&app)?;
    let encrypted = protect_bytes(payload.as_bytes())?;
    fs::write(path, encrypted).map_err(|error| format!("Não foi possível salvar o banco protegido: {error}"))
}

#[tauri::command]
fn secure_storage_clear(app: tauri::AppHandle) -> Result<(), String> {
    let path = database_path(&app)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Não foi possível remover o banco protegido: {error}")),
    }
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

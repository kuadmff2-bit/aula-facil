use std::{
    fs::{self, File},
    io::ErrorKind,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::Manager;

const DATABASE_FILE: &str = "database.dpapi";
const EXIT_BACKUP_DIRECTORY: &str = "exit-backups";
const EXIT_BACKUP_PREFIX: &str = "exit-";
const EXIT_BACKUP_SUFFIX: &str = ".dpapi";
const MAX_EXIT_BACKUPS: usize = 30;

fn data_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|error| {
        format!("Não foi possível localizar a pasta segura do AulaFácil: {error}")
    })?;
    fs::create_dir_all(&directory).map_err(|error| {
        format!("Não foi possível preparar a pasta segura do AulaFácil: {error}")
    })?;
    Ok(directory)
}

fn backup_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_directory(app)?.join(EXIT_BACKUP_DIRECTORY))
}

fn is_exit_backup(path: &PathBuf) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            name.starts_with(EXIT_BACKUP_PREFIX) && name.ends_with(EXIT_BACKUP_SUFFIX)
        })
}

pub fn exit_backup_paths(app: &tauri::AppHandle) -> Result<Vec<PathBuf>, String> {
    let directory = backup_directory(app)?;
    let entries = match fs::read_dir(&directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(format!(
                "Não foi possível listar os backups automáticos: {error}"
            ))
        }
    };

    let mut paths = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(is_exit_backup)
        .collect::<Vec<_>>();
    paths.sort_by(|left, right| right.file_name().cmp(&left.file_name()));
    Ok(paths)
}

fn prune_old_backups(app: &tauri::AppHandle) -> Result<(), String> {
    let paths = exit_backup_paths(app)?;
    for path in paths.into_iter().skip(MAX_EXIT_BACKUPS) {
        fs::remove_file(&path).map_err(|error| {
            format!("Não foi possível remover um backup automático antigo: {error}")
        })?;
    }
    Ok(())
}

pub fn create_exit_backup(app: &tauri::AppHandle) -> Result<(), String> {
    let source = data_directory(app)?.join(DATABASE_FILE);
    if !source.exists() {
        return Ok(());
    }

    let directory = backup_directory(app)?;
    fs::create_dir_all(&directory).map_err(|error| {
        format!("Não foi possível preparar a pasta de backups automáticos: {error}")
    })?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("O relógio do sistema não permitiu criar o backup: {error}"))?
        .as_millis();
    let destination = directory.join(format!(
        "{EXIT_BACKUP_PREFIX}{timestamp:013}{EXIT_BACKUP_SUFFIX}"
    ));

    fs::copy(&source, &destination)
        .map_err(|error| format!("Não foi possível criar o backup automático ao sair: {error}"))?;
    File::open(&destination)
        .and_then(|file| file.sync_all())
        .map_err(|error| {
            format!("Não foi possível confirmar o backup automático no disco: {error}")
        })?;

    prune_old_backups(app)
}

pub fn clear_exit_backups(app: &tauri::AppHandle) -> Result<(), String> {
    let directory = backup_directory(app)?;
    match fs::remove_dir_all(directory) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Não foi possível remover os backups automáticos: {error}"
        )),
    }
}

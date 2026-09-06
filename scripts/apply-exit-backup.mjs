import fs from "node:fs";

const path = "src-tauri/src/lib.rs";
let source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function replaceOnce(from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}`);
  source = source.replace(from, to);
}

replaceOnce(
  'use tauri::Manager;\n',
  'use tauri::Manager;\n\nmod exit_backup;\n',
  "declarar módulo de backup",
);

replaceOnce(
`#[tauri::command]
fn secure_storage_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let primary = database_path(&app)?;
    let backup = database_backup_path(&app)?;

    match load_protected_file(&primary, MAX_DATABASE_BYTES, "o banco protegido") {
        Ok(Some(content)) => Ok(Some(content)),
        Ok(None) => load_protected_file(&backup, MAX_DATABASE_BYTES, "a cópia de recuperação"),
        Err(primary_error) => match load_protected_file(&backup, MAX_DATABASE_BYTES, "a cópia de recuperação") {
            Ok(Some(content)) => Ok(Some(content)),
            Ok(None) => Err(primary_error),
            Err(backup_error) => Err(format!(
                "O banco principal e a cópia de recuperação não puderam ser abertos. Principal: {primary_error} Recuperação: {backup_error}"
            )),
        },
    }
}
`,
`fn load_latest_exit_backup(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    for path in exit_backup::exit_backup_paths(app)? {
        if let Ok(Some(content)) = load_protected_file(
            &path,
            MAX_DATABASE_BYTES,
            "um backup automático de saída",
        ) {
            return Ok(Some(content));
        }
    }
    Ok(None)
}

#[tauri::command]
fn secure_storage_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let primary = database_path(&app)?;
    let backup = database_backup_path(&app)?;
    let mut primary_error: Option<String> = None;
    let mut backup_error: Option<String> = None;

    match load_protected_file(&primary, MAX_DATABASE_BYTES, "o banco protegido") {
        Ok(Some(content)) => return Ok(Some(content)),
        Ok(None) => {}
        Err(error) => primary_error = Some(error),
    }

    match load_protected_file(&backup, MAX_DATABASE_BYTES, "a cópia de recuperação") {
        Ok(Some(content)) => return Ok(Some(content)),
        Ok(None) => {}
        Err(error) => backup_error = Some(error),
    }

    if let Some(content) = load_latest_exit_backup(&app)? {
        return Ok(Some(content));
    }

    match (primary_error, backup_error) {
        (Some(primary_error), Some(backup_error)) => Err(format!(
            "O banco principal e a cópia de recuperação não puderam ser abertos. Principal: {primary_error} Recuperação: {backup_error}"
        )),
        (Some(error), None) | (None, Some(error)) => Err(error),
        (None, None) => Ok(None),
    }
}
`,
  "adicionar recuperação por backup de saída",
);

replaceOnce(
`#[tauri::command]
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
`,
`#[tauri::command]
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
    exit_backup::clear_exit_backups(&app)?;
    Ok(())
}
`,
  "limpar backups junto com banco",
);

replaceOnce(
`        ])
        .run(tauri::generate_context!())
        .expect("não foi possível iniciar o AulaFácil");
}`,
`        ])
        .build(tauri::generate_context!())
        .expect("não foi possível iniciar o AulaFácil")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Err(error) = exit_backup::create_exit_backup(app) {
                    eprintln!("Falha ao criar backup automático de saída: {error}");
                }
            }
        });
}`,
  "executar snapshot no encerramento",
);

fs.writeFileSync(path, source);
console.log("Backup automático de saída integrado ao Tauri.");

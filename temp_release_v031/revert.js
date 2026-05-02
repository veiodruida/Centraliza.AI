const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');

const CONFIG_FILE = path.join(__dirname, 'config.json');

async function revert() {
    if (!fs.existsSync(CONFIG_FILE)) {
        console.error('Config file not found.');
        return;
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const centralDir = config.centralDir;

    console.log(`Buscando modelos para reverter das pastas configuradas...`);

    for (const dir of config.scanDirectories) {
        await revertDirectory(dir, centralDir);
    }
    
    console.log('\n--- Reversão Concluída ---');
    console.log(`Agora você pode apagar a pasta ${centralDir} e usar o site para centralizar novamente com a nova arquitetura.`);
}

async function revertDirectory(dir, centralDir) {
    if (!fs.existsSync(dir)) return;

    try {
        const entries = await promisify(fs.readdir)(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await revertDirectory(fullPath, centralDir);
            } else if (entry.isFile()) {
                const stat = await promisify(fs.lstat)(fullPath);
                
                // Se for um link simbólico
                if (stat.isSymbolicLink()) {
                    const targetPath = await promisify(fs.readlink)(fullPath);
                    if (targetPath.startsWith(centralDir)) {
                        console.log(`Revertendo Symlink: ${fullPath}`);
                        try {
                            // Deleta o symlink
                            await promisify(fs.unlink)(fullPath);
                            // Move o arquivo de volta do centralDir para o lugar original
                            await promisify(fs.rename)(targetPath, fullPath);
                            console.log(`  -> Sucesso! Arquivo real restaurado.`);
                        } catch (e) {
                            console.error(`  -> Erro ao reverter symlink:`, e.message);
                        }
                    }
                } 
                // Se for um hardlink (nlink > 1)
                else if (stat.nlink > 1) {
                    const ext = path.extname(entry.name).toLowerCase();
                    const isOllamaBlob = entry.name.startsWith('sha256-') && ext === '';
                    const expectedName = isOllamaBlob ? entry.name + '.gguf' : entry.name;
                    const expectedCentralPath = path.join(centralDir, expectedName);

                    // Verifica se o hardlink correspondente existe no centralDir
                    if (fs.existsSync(expectedCentralPath)) {
                        const centralStat = await promisify(fs.stat)(expectedCentralPath);
                        // Verifica se são o mesmo arquivo (mesmo inode)
                        if (centralStat.ino === stat.ino) {
                            console.log(`Revertendo Hardlink: ${fullPath}`);
                            try {
                                // Para restaurar as permissões originais da pasta, fazemos uma cópia física,
                                // apagamos os hardlinks originais, e renomeamos a cópia de volta.
                                const tempPath = fullPath + '.temp_restore';
                                await promisify(fs.copyFile)(fullPath, tempPath);
                                
                                // Deleta o hardlink na pasta central
                                await promisify(fs.unlink)(expectedCentralPath);
                                // Deleta o hardlink na pasta original
                                await promisify(fs.unlink)(fullPath);
                                
                                // Renomeia o temp de volta para a pasta original (herdando permissões limpas)
                                await promisify(fs.rename)(tempPath, fullPath);
                                console.log(`  -> Sucesso! Arquivo desvinculado e permissões restauradas.`);
                            } catch (e) {
                                console.error(`  -> Erro ao reverter hardlink:`, e.message);
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error(`Erro ao escanear ${dir}:`, e.message);
    }
}

revert();

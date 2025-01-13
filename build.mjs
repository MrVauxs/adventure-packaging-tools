#!/usr/bin/env node

import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";

// Clean output directory, or create build directory
const outDir = path.resolve(process.cwd(), "build");
if (existsSync(outDir)) {
    const filesToClean = (await fs.readdir(outDir)).map((dirName) => path.resolve(outDir, dirName));
    for (const file of filesToClean) {
        await fs.rm(file, { recursive: true });
    }
} else {
    await fs.mkdir(outDir);
}

// Build packs
async function compileMultiple(packFolders, previous) {
    for (const pack of packFolders) { // actors
        if (pack.isDirectory()) {
            const filepath = path.resolve(previous, pack.name);
            const files = await fs.readdir(filepath, { withFileTypes: true });

            if (files.some(x => x.isDirectory())) {
                await compileMultiple(files, `${previous}/${pack.name}`);
            } else {
                const output = path.resolve(outDir, `${previous}/${pack.name}`);
                if (!existsSync(output)) {
                    await fs.mkdir(output, { recursive: true });
                }
                await compilePack(filepath, output);
            }
        }
    }
}

const packFolders = await fs.readdir("packs", { withFileTypes: true }); // packs/actors
compileMultiple(packFolders, "packs")


// Copy files and folders to output
const files = [
    "assets",
    "scripts",
    "module.json"
];
for (const file of files) {
    await fs.cp(file, path.resolve(outDir, file), { recursive: true });
}
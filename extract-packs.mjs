#!/usr/bin/env node

import { extractPack } from "@foundryvtt/foundryvtt-cli";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { JSDOM } from 'jsdom';
import { warn, changed, error } from './utils.mjs';

const moduleJSON = JSON.parse(await fs.readFile(path.resolve(process.cwd(), 'module.json'), 'utf-8'));
const outDir = path.resolve(process.cwd(), "build");
const packsCompiled = path.resolve(outDir, "packs/");
if (!existsSync(packsCompiled)) {
    console.error("Packs directory does not exist in the build");
}

const packFolders = await fs.readdir(packsCompiled);

console.log("Cleaning packs");

for (const pack of packFolders) {
    if (!existsSync(`packs/${pack}`)) {
        await fs.mkdir(`packs/${pack}`)
    }
    const files = await fs.readdir(`packs/${pack}`, { withFileTypes: true });
    const jsonFiles = files
        .filter((f) => f.isFile() && f.name.toLowerCase().endsWith(".json"))
        .map((f) => f.name);
    for (const file of jsonFiles) {
        await fs.rm(path.resolve("packs", pack, file));
    }
}

function fix(entry, key, parent) {
    if (!entry[key]) return;

    if (key === "system") {
        if (entry[key].source) {
            if (typeof entry[key].source === "string") {
                entry[key].source = {
                    rules: "2024",
                    revision: 1
                }
            }

            if (entry[key]?.source?.custom) {
                delete entry[key].source.custom;
            }

            entry[key].source.book = Object.keys(moduleJSON.flags.dnd5e.sourceBooks)[0];
        }
    }

    // Check if a scene has a thumbnail
    if (key === "thumb") {
        if (entry[key].startsWith("modules/")) {
            const thumbPath = path.resolve(process.cwd(), entry[key]).replace(`modules/${moduleJSON.id}/`, "");
            if (!existsSync(thumbPath)) {
                error(`Thumbnail ${entry[key]} does not exist!`, `packs/${entry?._key?.split("!")[1]}/${entry.name}_${entry._id}.json`)
            }
        } else {
            error(`Thumbnail "${entry[key]}" is not in the modules folder!`, `packs/${entry?._key?.split("!")[1]}/${entry.name}_${entry._id}.json`)
        }
    }


    // Check if a given image path exists
    if (key === "img" && entry[key].startsWith("modules/")) {
        const imgPath = path.resolve(process.cwd(), entry[key]).replace(`modules/${moduleJSON.id}/`, "");
        if (!existsSync(decodeURIComponent(imgPath))) {
            error(`Image ${entry[key]} does not exist!`, `packs/${entry?._key?.split("!")[1]}/${entry.name}_${entry._id}.json`)
            if (!entry[key].includes(moduleJSON.id)) {
                entry[key] = entry[key].replace(/modules\/[a-z\-]+?\//g, `modules/${moduleJSON.id}/`);
            }
        }
    }

    // Fix prototype tokens not matching actor names
    if (key === "prototypeToken") {
        if (entry[key].name !== entry.name) {
            if (entry[key].name.split(" ").find(x => entry.name.split(" ").find(y => y.includes(x)))) {
                warn(`Token Prototype "${entry[key].name}" has a mismatching but similar name to "${entry.name}"!`)
            } else {
                changed(`Replaced "${entry[key].name}" to "${entry.name}" in token prototype!`)
                entry[key].name = entry?.name || "ERROR 404"
            }
        }
    }

    // Fix token names not matching actor names
    if (key === "tokens") {
        entry["tokens"] = entry["tokens"].map((token) => {
            const actor = parent?.actors?.find((val) => val._id && token.actorId && val._id === token.actorId)

            if (!actor) {
                error(`"${entry?.name}" scene inside ${parent?.name} has a token ${entry?.name} without an actor!`, `packs/${entry?._key?.split("!")[1]}/${entry?.name}_${entry?._id}.json`)
            }

            if (token.name !== actor?.prototypeToken.name) {
                changed(`Replaced "${token.name}" to "${actor?.prototypeToken.name}" on the ${entry.name} scene!`)
                token.name = actor?.prototypeToken.name || "ERROR 404"
            }

            return token
        })
    }

    if (key === "journal" && Array.isArray(entry["journal"])) {
        entry["journal"] = entry["journal"].map((journal) => {
            journal.pages = journal.pages.map((page) => {
                page.text.content = fixHTML(page.text.content, page)
                return page
            })

            return journal
        })
    }

    if (key === "pages") {
        entry["pages"] = entry["pages"].map((page) => {
            page.text.content = fixHTML(page.text.content, page)
            return page
        })
    }

    // Fix relative UUIDs to use [[/item]] syntax in D&D5e compendiums
    if (entry._stats?.systemId === "dnd5e") {
        if (key === "actors" && Array.isArray(entry["actors"])) {
            entry["actors"] = entry["actors"].map(actor => {
                fixItems(actor.items)

                return actor;
            })
        }

        if (key === "items" && Array.isArray(entry["items"])) {
            entry["items"] = fixItems(entry["items"])
        }
    }
}

function fixItems(items) {
    items = items.map(item => {
        if (!item.system?.description?.value) return item;

        item.system.description.value = item.system.description.value
            .replaceAll(/\@UUID\[\.(\w+)\]/g, (match, p1) => {
                changed(`Replacing relational UUID "${match}" to use [[/item]] syntax!`)
                return `[[/item ${p1}]]`
            });

        // Check for missing spell tags and wrap them in curly brackets
        // Commented out due to how many errors it would throw due to 5e being 5e
        /* if (changeList.missingTags) {
            for (const tag of changeList.missingTags) {
                // Create regex that matches the tag when not already in curly braces
                const regex = new RegExp(`(?<!{)\\b${tag}\\b(?!})`, 'g');

                if (regex.test(item.system.description.value)) {
                    error(`Missing spell tag "${tag}" in ${item.name} item!`);
                }
            }
        } */

        return item;
    })

    return items;
}

let changeList;
try {
    const changeListPath = path.resolve(process.cwd(), 'changeList.json');
    changeList = JSON.parse(await fs.readFile(changeListPath, 'utf-8'));
} catch (err) {
    if (err.code === 'ENOENT') {
        console.warn("Module changeList.json not found. Falling back to default changeList.");
        const localChangeListPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'changeList.json');
        changeList = JSON.parse(await fs.readFile(localChangeListPath, 'utf-8'));
    } else {
        throw err;
    }
}

function fixHTML(text, page) {
    // Check for missing spell tags and wrap them in curly brackets
    if (changeList.missingTags) {
        for (const [tag, uuid] of changeList.missingTags) {
            // Create regex that matches the tag when not already in curly braces
            const regex = new RegExp(`(?<!{)\\b${tag}\\b(?!['}’])`, 'g');

            if (regex.test(text)) {
                warn(`Possible missing UUID tag around "${tag}" in ${page.name} page!`);
            }
        }
    }

    const dom = new JSDOM(text)

    dom.window.document.querySelectorAll('a').forEach((anchor) => {
        if (anchor.href !== "" && anchor.href !== "#" && !anchor.href.includes(".html")) return;

        changed(`Removing empty ("" or "#") anchor wrap with the text: ${anchor.innerHTML}`);
        const parent = anchor.parentNode;
        while (anchor.firstChild) {
            parent.insertBefore(anchor.firstChild, anchor);
        }
        parent.removeChild(anchor);
    })

    function changeTagName(el, newTagName) {
        const n = dom.window.document.createElement(newTagName);
        const attr = el.attributes;
        for (let i = 0, len = attr.length; i < len; ++i) {
            n.setAttribute(attr[i].name, attr[i].value);
        }
        n.innerHTML = el.innerHTML;
        el.parentNode.replaceChild(n, el);
    }

    const hitList = Object.entries(changeList.html)

    for (const hit of hitList) {
        const titlesAsParagraphs = dom.window.document.getElementsByClassName(hit[0])
        for (let i = 0; i < titlesAsParagraphs.length; i++) {
            if (titlesAsParagraphs[i].nodeName === hit[1].toUpperCase()) continue;

            changeTagName(titlesAsParagraphs[i], hit[1]);
            changed(`Replaced "${hit[0]}" to be inside of a <${hit[1]}> element inside ${page.name} page!`)
        }
    }

    return dom.window.document.body.innerHTML
}

for (const pack of packFolders) {
    console.log(`Extracting pack: ${pack}`);
    await extractPack(path.resolve(packsCompiled, pack), `packs/${pack}`, {
        transformEntry: (entry) => {
            Object.keys(entry).forEach((key) => {
                // Fixes PDF mistakes such as " . ", "te- xt". Does not fix line-breaks.
                // Also a lazy way to remove JSON fields that are not needed.
                entry[key] = JSON.parse(
                    JSON.stringify(entry[key])
                        .replaceAll(" . ", ". ")
                        .replaceAll(" .<", ".<")
                        .replaceAll(" .\"", ".\"")
                        .replaceAll(/(\S)- /g, "$1")
                        .replaceAll(/,"modifiedTime":\d+/g, "")
                        .replaceAll(/,"lastModifiedBy":"\w+"/g, "")
                        .replaceAll(
                            /modules\/([a-z\-]+?)(?<!\/assets)\/(images|sounds)/g,
                            `modules/${moduleJSON.id}/assets/$2`
                        )
                        .replaceAll("heliana-core", moduleJSON.id)
                        .replaceAll("wrong-module", moduleJSON.id)
                        .replaceAll(/style=\\"box-sizing:border-box;user-select:text.+?\\"/g, "")
                )

                fix(entry, key)
            })

            if (entry._key && entry._key.includes("adventure")) {
                // Grab every key in adventure
                Object.keys(entry).forEach((adventureKey) => {
                    if (!Array.isArray(entry[adventureKey])) return; // See if its a collection

                    // Execute on every collection
                    entry[adventureKey] = entry[adventureKey].map((itemEntry) => {
                        // Fix each key inside individual item of a collection
                        Object.keys(itemEntry).forEach((itemKey) => {
                            fix(itemEntry, itemKey, entry)
                        })
                        return itemEntry
                    })

                })
            }
        }
    });
}

console.log("Extraction Complete");
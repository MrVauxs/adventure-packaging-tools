#!/usr/bin/env node

import { extractPack } from "@foundryvtt/foundryvtt-cli";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { JSDOM } from 'jsdom';
import moduleJSON from './module.json' with { type: "json" };
import changeList from './changeList.json' with { type: "json" };
import { warn, changed, error } from './utils';

const outDir = path.resolve(process.cwd(), "build");
const packsCompiled = path.resolve(outDir, "packs/");
if (!existsSync(packsCompiled)) {
    console.error("Packs directory does not exist in the build");
}

const packFolders = await fs.readdir(packsCompiled);

console.log("Cleaning packs");

for (const pack of packFolders) {
    const files = await fs.readdir(`packs/${pack}`, { withFileTypes: true });
    const jsonFiles = files
        .filter((f) => f.isFile() && f.name.toLowerCase().endsWith(".json"))
        .map((f) => f.name);
    for (const file of jsonFiles) {
        await fs.rm(path.resolve("packs", pack, file));
    }
}

function fix(entry, key, parent) {
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
            const actor = parent.actors.find((val) => val._id && token.actorId && val._id === token.actorId)

            if (!actor) {
                error(`"${entry.name}" scene inside ${parent.name} has a token ${entry?.name} without an actor!`)
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
        return item;
    })

    return items;
}

function fixHTML(text, page) {
    const dom = new JSDOM(text)

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
                        .replaceAll(/(\D)- /g, "$1")
                        .replaceAll(/Compendium\.heliana-core(.+)\]/g, (match, p1) => {
                            console.warn("[CHANGED] Found a heliana-core tag! Replacing with wrong-module.")
                            return `Compendium.wrong-module${p1}]`
                        })
                        .replaceAll(/,"modifiedTime":\d+/g, "")
                        .replaceAll(/,"lastModifiedBy":"\w+"/g, "")
                        .replaceAll("rotrr", "heliana-dab")
                        .replaceAll(
                            /modules\/([a-z\-]+?)(?<!\/assets)\/(images|sounds)/g,
                            `modules/${moduleJSON.id}/assets/$2`
                        )
                        .replaceAll("heliana-core", moduleJSON.id)
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
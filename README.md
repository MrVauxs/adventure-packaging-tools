# Vauxs' Adventure Packaging Tools

A collection of tools to help with packaging and distributing adventure modules for Foundry VTT.

- Extract takes everything from a `build/packs` directory and extracts the NeDB databases into JSON in the `packs` directory.
- Build takes everything from the `packs` directory and builds the module in `build` directory.
- Link creates a symbolic link from the `build` to a Foundry VTT data directory.

## Instructions

The entire project assumes the following folders and files to exist in the root directory: `assets/, scripts/, packs/, module.json`. As mentioned above, it also creates a `build/` directory to symlink into your Foundry insntance, thus putting the repository itself into the modules folder will not work and **risks losing your data**.

Run `npm i --save-dev github:MrVauxs/adventure-packaging-tools` to install the module locally to your project.

You can then add the following scripts.
```json
{
    "scripts": {
            "extract": "npx --package=adventure-packaging-tools extract",
            "build": "npx --package=adventure-packaging-tools build",
            "link": "npx --package=adventure-packaging-tools link",
    }
}
```

> [!note]
> It is important to note that this entire repository is:
> 1. Based on the [PF2e Starfinder Playtest](https://github.com/TikaelSol/starfinder-field-test/tree/main) repository code, which I thank for.
> 2. Primarily made to aid for revitalizing the Heliiana's Guide to Monster Hunting modules, and thus contains various defaults made specifically for their books.
> 3. Easily forkable, letting you remedy the above point and change it to your own defaults and filters. All you will need to change is the `npm i` command to be your `github:username/repo-name`.

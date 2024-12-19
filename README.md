# Vauxs' Adventure Packaging Tools

A collection of tools to help with packaging and distributing adventure modules for Foundry VTT.

- Extract takes everything from a `build/packs` directory and extracts the NeDB databases into JSON in the `packs` directory.
- Build takes everything from the `packs` directory and builds the module in `build` directory.
- Link creates a symbolic link from the `build` to a Foundry VTT data directory.

## Example
```json
{
    "scripts": {
            "extract": "npx --package=adventure-packaging-tools extract",
            "build": "npx --package=adventure-packaging-tools build",
            "link": "npx --package=adventure-packaging-tools link",
    }
}
```
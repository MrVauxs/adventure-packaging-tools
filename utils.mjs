import c from 'chalk';

export function error(message) {
    console.error(`${c.red("[ERROR]")} ${message}`);
}

export function warn(message) {
    console.warn(`${c.yellow("[WARNING]")} ${message}`);
}

export function changed(message) {
    console.warn(`${c.magenta("[CHANGED]")} ${message}`);
}
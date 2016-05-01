interface ansi_up {
    ansi_to_html(txt: string): string;
}

declare module "ansi_up" {
    export = ansi_up;
}

declare var ansi_up: ansi_up;

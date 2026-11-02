import { createInterface } from "node:readline";

/**
 * Console interactive de l'hôte : raccourcis Ctrl+lettre et questions au clavier.
 * Ne fait rien si la sortie n'est pas un vrai terminal (lancement automatisé).
 */
export class HostConsole {
  private handlers = new Map<string, () => void | Promise<void>>();
  private busy = false;
  readonly interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  /** Associe Ctrl+<lettre> à une action. */
  onCtrl(letter: string, action: () => void | Promise<void>): void {
    const code = letter.toUpperCase().charCodeAt(0) - 64; // Ctrl+A = 1, Ctrl+P = 16…
    this.handlers.set(String.fromCharCode(code), action);
  }

  start(): void {
    if (!this.interactive) return;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", this.onData);
  }

  stop(): void {
    if (!this.interactive) return;
    process.stdin.off("data", this.onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  /** Pose une question et renvoie la réponse tapée (chaîne vide si Entrée seule). */
  async ask(question: string): Promise<string> {
    if (!this.interactive) return "";
    const wasRaw = process.stdin.isRaw;
    process.stdin.off("data", this.onData);
    process.stdin.setRawMode(false);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await new Promise<string>((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
        // Ctrl+C pendant une question = réponse vide.
        rl.on("SIGINT", () => {
          process.stdout.write("\n");
          resolve("");
        });
      });
    } finally {
      rl.close();
      if (wasRaw) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", this.onData);
      }
    }
  }

  private onData = (chunk: string) => {
    if (this.busy) return;
    for (const ch of chunk) {
      const action = this.handlers.get(ch);
      if (!action) continue;
      this.busy = true;
      Promise.resolve(action()).finally(() => (this.busy = false));
      return;
    }
  };
}

import { assertEqual, runSuite, type TestCase } from './persistence2Harness.ts';

interface FakeEvent {
  readonly type: string;
  preventDefault?(): void;
}

type FakeListener = (event: FakeEvent) => void;

class FakeStyle {
  public cssText = '';
  private readonly values = new Map<string, string>();
  public setProperty(name: string, value: string): void { this.values.set(name, value); }
  public getPropertyValue(name: string): string { return this.values.get(name) ?? ''; }
  [key: string]: string | ((name: string, value: string) => void) | ((name: string) => string) | Map<string, string>;
}

class FakeElement {
  public readonly style = new FakeStyle();
  public readonly dataset: Record<string, string> = {};
  public readonly children: FakeElement[] = [];
  public textContent = '';
  public className = '';
  public id = '';
  public disabled = false;
  public draggable = false;
  public tabIndex = 0;
  public parent: FakeElement | null = null;
  private readonly listeners = new Map<string, FakeListener[]>();

  public append(...nodes: FakeElement[]): void { for (const node of nodes) this.appendChild(node); }
  public appendChild(node: FakeElement): FakeElement { node.parent = this; this.children.push(node); return node; }
  public remove(): void {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
  public addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  public removeEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type);
    if (listeners === undefined) return;
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  }
  public dispatchEvent(event: FakeEvent): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
  public focus(): void {}
}

class FakeDocument {
  public readonly body = new FakeElement();
  public readonly documentElement = new FakeElement();
  public createElement(_tag: string): FakeElement { return new FakeElement(); }
  public getElementById(_id: string): FakeElement | null { return null; }
}

class FakeWindow {
  public innerWidth = 854;
  public innerHeight = 480;
  private readonly listeners = new Map<string, FakeListener[]>();
  public addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  public removeEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type);
    if (listeners === undefined) return;
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  }
  public dispatchEvent(event: FakeEvent): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
  public listenerCount(type: string): number { return this.listeners.get(type)?.length ?? 0; }
}

function installDom(): { readonly document: FakeDocument; readonly window: FakeWindow } {
  const fakeDocument = new FakeDocument();
  const fakeWindow = new FakeWindow();
  (globalThis as unknown as { document: Document }).document = fakeDocument as unknown as Document;
  (globalThis as unknown as { window: Window & typeof globalThis }).window = fakeWindow as unknown as Window & typeof globalThis;
  if (typeof CustomEvent === 'undefined') {
    class ValidationCustomEvent implements FakeEvent {
      public constructor(public readonly type: string) {}
    }
    (globalThis as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent = ValidationCustomEvent as unknown as typeof CustomEvent;
  }
  return { document: fakeDocument, window: fakeWindow };
}

function click(element: FakeElement): void {
  element.dispatchEvent({ type: 'click', preventDefault: () => undefined });
}

const tests: TestCase[] = [
  {
    name: 'pause menu exposes current actions and cleans up mounted screen listeners',
    run: async () => {
      const dom = installDom();
      const { PauseMenuScreen } = await import('../src/ui/menu/PauseMenuScreen.ts');
      const actions: string[] = [];
      const screen = new PauseMenuScreen({
        resume: () => actions.push('resume'),
        options: () => actions.push('options'),
        saveQuit: () => actions.push('saveQuit'),
      });
      const root = screen.root as unknown as FakeElement;
      assertEqual(root.children.length, 4, 'pause menu contains title and three buttons');
      assertEqual(root.children[0]!.textContent, 'Game menu', 'pause title label');
      assertEqual(root.children[1]!.textContent, 'Back to Game', 'resume button label');
      assertEqual(root.children[2]!.textContent, 'Options...', 'options button label');
      assertEqual(root.children[3]!.textContent, 'Save and Quit to Title', 'save-and-quit button label');
      screen.mount(dom.document.body as unknown as HTMLElement);
      assertEqual(dom.document.body.children.length, 1, 'mounted pause menu appends root');
      assertEqual(dom.window.listenerCount('resize'), 1, 'mounted pause menu installs one resize listener');
      click(root.children[1]!);
      click(root.children[2]!);
      assertEqual(actions.join(','), 'resume,options', 'resume and options actions dispatch');
      screen.dispose();
      assertEqual(dom.document.body.children.length, 0, 'disposed pause menu removes root');
      assertEqual(dom.window.listenerCount('resize'), 0, 'disposed pause menu removes resize listener');
    },
  },
];

await runSuite('validatePauseMenu', tests);

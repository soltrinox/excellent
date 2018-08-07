///////////////////////////////////////////
// Complete Excellent.js 0.5.4 declaration
//
// TODO: May need some export tweaking to make import-able for client-side.
///////////////////////////////////////////

type BindingProcess = boolean | (() => void);

interface ControlledElement extends Element {
    readonly controllers: { readonly [name: string]: EController };
}

interface EController {
    readonly name: string;
    readonly node: ControlledElement;

    bind(process?: BindingProcess): void

    depends(ctrlNames: string[]): void

    extend(ctrlName: string | string[]): EController | EController[]

    find(ctrlName: string): EController[]

    findOne(ctrlName: string): EController

    onInit: () => void
    onDestroy: () => void
}

interface ERoot {
    version: string;

    services: any;

    addController(name: string, cb: (ctrl: EController) => void)

    addModule(name: string, cb: (self: any) => void)

    addService(name: string, cb: (self: any) => void)

    bind(process?: BindingProcess): void

    find(ctrlName: string): EController[]

    findOne(ctrlName: string): EController

    onInit: () => void
}

declare const excellent: ERoot;

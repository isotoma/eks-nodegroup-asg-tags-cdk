export const log = (message: string, extra: Record<string, unknown> = {}): void => {
    console.log(
        JSON.stringify({
            message,
            ...extra,
        }),
    );
};

export const logError = (error: Error, message: string, extra: Record<string, unknown> = {}): void => {
    const stack = error.stack;
    const stackLines = stack ? stack.split(/\n/) : [];
    console.error(
        JSON.stringify({
            error: {
                name: error.name,
                message: error.message,
                stack: stackLines,
            },
            message,
            ...extra,
        }),
    );
};

export enum RequestType {
    Create = 'Create',
    Update = 'Update',
    Delete = 'Delete',
}

export interface Response {
    PhysicalResourceId: string;
    Data: Record<string, unknown>;
}

export interface CreateEvent<R> {
    ResourceProperties: R;
    RequestType: RequestType.Create;
}

export interface UpdateEvent<R> {
    PhysicalResourceId: string;
    RequestType: RequestType.Update;
    ResourceProperties: R;
    OldResourceProperties: R;
}

export interface DeleteEvent<R> {
    PhysicalResourceId: string;
    RequestType: RequestType.Delete;
    ResourceProperties: R;
}

export type Event<R> = CreateEvent<R> | UpdateEvent<R> | DeleteEvent<R>;

export const hasKey = <K extends string>(key: K, obj: unknown): obj is { [_ in K]: Record<string, unknown> } => {
    return typeof obj === 'object' && !!obj && key in obj;
};

export const getTypedKeyOrError = <A>(key: string, obj: unknown, errorMessageRoot: string, typeName: string, typeCheck: (value: unknown) => value is A): A => {
    if (!hasKey(key, obj)) {
        throw new Error(`${errorMessageRoot}: no ${key} set`);
    }
    const value = obj[key];
    if (!typeCheck(value)) {
        throw new Error(`${errorMessageRoot}: ${key} is not a ${typeName}`);
    }
    return value;
};

export const getUntypedKeyOrError = (key: string, obj: unknown, errorMessageRoot: string): unknown => {
    if (!hasKey(key, obj)) {
        throw new Error(`${errorMessageRoot}: no ${key} set`);
    }
    return obj[key];
};

export const isString = (a: unknown): a is string => {
    return typeof a === 'string';
};

export const getStringKeyOrError = (key: string, obj: unknown, errorMessageRoot: string): string => {
    return getTypedKeyOrError<string>(key, obj, errorMessageRoot, 'string', isString);
};

import { InputMaybe } from '../gen';

export const notNullUndefined = <T>(input: InputMaybe<T>) => {
    if (input !== null && input !== undefined) {
        return input as T;
    } else {
        return false;
    }
};

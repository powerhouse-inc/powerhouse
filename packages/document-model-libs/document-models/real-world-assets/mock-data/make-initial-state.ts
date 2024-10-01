import { initialState } from './initial-state';

const string = JSON.stringify(JSON.stringify(initialState));

console.log(string);

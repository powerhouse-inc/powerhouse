import { InputProperty } from './input/index.js';
import { PieceAuthProperty } from './authentication/index.js';
import * as z from "zod/mini";
import { PropertyType } from './input/property-type.js';
import { DropdownState } from './input/dropdown/common.js';

// EXPORTED
export { ApFile } from './input/file-property.js';
export type { ApStreamingFile } from './input/file-property.js';
export { DropdownProperty, MultiSelectDropdownProperty } from './input/dropdown/dropdown-prop.js';
export { DynamicProperties, DynamicProp } from './input/dynamic-prop.js';
export { PropertyType } from './input/property-type.js';
export { Property } from './input/index.js';
export { PieceAuth,getAuthPropertyForValue } from './authentication/index.js';
export type { ExtractPieceAuthPropertyTypeForMethods } from './authentication/index.js';
export { DynamicPropsValue } from './input/dynamic-prop.js';
export { DropdownOption,DropdownState } from './input/dropdown/common.js';
export { OAuth2PropertyValue } from './authentication/oauth2-prop.js';
export { PieceAuthProperty, DEFAULT_CONNECTION_DISPLAY_NAME} from './authentication/index.js';
export { ShortTextProperty } from './input/text-property.js';
export { RichTextProperty } from './input/rich-text-property.js';
export { ArrayProperty, ArraySubProps } from './input/array-property.js';
export { BasePropertySchema } from './input/common.js';
export { CheckboxProperty } from './input/checkbox-property.js';
export { DateTimeProperty } from './input/date-time-property.js';
export { DateRangeProperty, DateRangeValue, DateRangePreset, dateRangeUtils } from './input/date-range-property.js';
export { LongTextProperty } from './input/text-property.js';
export { NumberProperty } from './input/number-property.js';
export { ObjectProperty } from './input/object-property.js';
export { OAuth2Props } from './authentication/oauth2-prop.js';
export { OAuth2AuthorizationMethod } from './authentication/oauth2-prop.js';
export { BasicAuthPropertyValue } from './authentication/basic-auth-prop.js';
export { StaticMultiSelectDropdownProperty } from './input/dropdown/static-dropdown.js';
export { StaticDropdownProperty } from './input/dropdown/static-dropdown.js';
export * from './authentication/custom-auth-prop.js';
export * from './authentication/oidc-prop.js';
export { OAuth2Property } from './authentication/oauth2-prop.js';
export { FileProperty } from './input/file-property.js';
export { BasicAuthProperty } from './authentication/basic-auth-prop.js';
export { SecretTextProperty } from './authentication/secret-text-property.js'
export { CustomAuthProperty } from './authentication/custom-auth-prop.js';

export { JsonProperty } from './input/json-property.js'
export const PieceProperty = z.union([InputProperty, PieceAuthProperty])
export type PieceProperty = InputProperty | PieceAuthProperty;
export {CustomProperty} from './input/custom-property.js'
export type {CustomPropertyCodeFunctionParams} from './input/custom-property.js'
export const PiecePropertyMap = z.record(z.string(), PieceProperty)
export interface PiecePropertyMap {
  [name: string]: PieceProperty;
}
export type { InputProperty } from './input/index.js';
export const InputPropertyMap = z.record(z.string(), InputProperty)
export interface InputPropertyMap {
  [name: string]: InputProperty;
}
export { piecePropertiesUtils } from './util.js';

export type PiecePropValueSchema<T extends PieceProperty> =
  T extends undefined
  ? undefined
  : T extends { required: true }
  ? T['valueSchema']
  : T['valueSchema'] | undefined;

export type StaticPropsValue<T extends PiecePropertyMap> = {
  [P in keyof T]: PiecePropValueSchema<T[P]>;
};



export type ExecutePropsResult<T extends PropertyType.DROPDOWN | PropertyType.MULTI_SELECT_DROPDOWN | PropertyType.DYNAMIC> = {
  type: T
  options: T extends PropertyType.DROPDOWN ? DropdownState<unknown> : T extends PropertyType.MULTI_SELECT_DROPDOWN ? DropdownState<unknown> : InputPropertyMap
}

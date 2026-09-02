import * as z from "zod/mini";
import { TPropertyValue } from '../input/common.js';
import { PropertyType } from '../input/property-type.js';
import { LongTextProperty, ShortTextProperty } from '../input/text-property.js';
import { NumberProperty } from '../input/number-property.js';
import { CheckboxProperty } from '../input/checkbox-property.js';
import { StaticDropdownProperty, StaticMultiSelectDropdownProperty } from '../input/dropdown/static-dropdown.js';
import { type StaticPropsValue } from '../index.js';
import { SecretTextProperty } from './secret-text-property.js';
import { BasePieceAuthSchema } from './common.js';
import { MarkDownProperty } from '../input/markdown-property.js';
import { type ServerContext } from '../../context/index.js';

const CustomAuthProps = z.record(z.string(), z.union([
  ShortTextProperty,
  LongTextProperty,
  NumberProperty,
  CheckboxProperty,
  StaticDropdownProperty,
]));

export type CustomAuthProps = Record<
  string,
  | ShortTextProperty<boolean>
  | LongTextProperty<boolean>
  | SecretTextProperty<boolean>
  | NumberProperty<boolean>
  | StaticDropdownProperty<unknown, boolean>
  | CheckboxProperty<boolean>
  | MarkDownProperty
  | StaticMultiSelectDropdownProperty<unknown, boolean>
>;

export const CustomAuthProperty = z.object({
  ...BasePieceAuthSchema.shape,
  props: CustomAuthProps,
  ...TPropertyValue(z.unknown(), PropertyType.CUSTOM_AUTH).shape,
})

export type CustomAuthRefresh<T extends CustomAuthProps> = {
  generate: (params: { auth: StaticPropsValue<T>; server: Omit<ServerContext, 'token'> }) => Promise<{
    access_token: string
    /**
     * Token lifetime in seconds. When omitted, `defaultExpiresIn` (or the framework
     * default) is used. Use `0` to mark the token as non-expiring — it is then cached
     * indefinitely and never refreshed. The server refreshes 15 minutes before expiry,
     * clamped to half the lifetime so short-lived tokens are not refreshed on every call.
     */
    expires_in?: number
  }>
  /** Fallback token lifetime in seconds when `generate` omits `expires_in`. `0` means non-expiring. */
  defaultExpiresIn?: number
}

export type CustomAuthProperty<
  T extends CustomAuthProps
> = BasePieceAuthSchema<StaticPropsValue<T>> & {
  props: T;
  refresh?: CustomAuthRefresh<T>;
} &
  TPropertyValue<
    StaticPropsValue<T>,
    PropertyType.CUSTOM_AUTH,
    true
  >;

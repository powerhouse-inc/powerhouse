import { z } from 'zod';

export const dateValidator = z.coerce.date();

export const numberValidator = z.number();

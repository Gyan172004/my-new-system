import { z } from 'zod';
export const withdrawalReasonSchema = z.enum([
  'content_error',
  'rights_issue',
  'security_issue',
  'operator_withdrawal',
]);

import { createRuntime } from '../server/runtime.js';
import { handler } from '../server/http.js';
let runtime;
export const config = { api: { bodyParser: false } };
export default handler(
  () =>
    (runtime ??= createRuntime(process.env).catch((error) => {
      runtime = null;
      throw error;
    })),
);

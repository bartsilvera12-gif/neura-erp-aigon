import "server-only";
import { cookies, headers } from "next/headers";
import {
  DEVICE_COOKIE_NAME,
  resolveDeviceType,
  type DeviceType,
} from "./detect";

/** Lee el tipo de dispositivo desde server components / route handlers.
 *  Usa la cookie seteada por el middleware como fuente principal; si no existe,
 *  vuelve a parsear el UA en runtime. */
export async function getDeviceTypeFromRequest(): Promise<DeviceType> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const cookieValue = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
  const userAgent = headerList.get("user-agent");
  return resolveDeviceType({ cookieValue, userAgent });
}

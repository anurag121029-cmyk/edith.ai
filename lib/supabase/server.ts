import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "../config";
export async function createServerSupabase() {
  if (!isSupabaseConfigured) return null;
  const store = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { getAll: () => store.getAll(), setAll: (list: { name: string; value: string; options: CookieOptions }[]) => { try { list.forEach(({name,value,options}) => store.set(name,value,options)); } catch {} } },
  });
}

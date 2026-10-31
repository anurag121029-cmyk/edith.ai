"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const sb = createClient(); if (!sb) { setLoading(false); return; }
    sb.auth.getUser().then(({ data }) => { setUser(data.user); setLoading(false); });
  }, []);
  return { user, loading, sb: createClient() };
}

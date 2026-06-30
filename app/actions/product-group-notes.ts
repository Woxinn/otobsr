"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/roles";

export async function createProductGroupNote(groupId: string, content: string) {
  await requireAdminRole();
  
  const trimmed = content?.trim();
  if (!groupId || !trimmed) {
    throw new Error("Kategori ID ve not içeriği zorunludur.");
  }
  
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("product_group_notes")
    .insert({
      group_id: groupId,
      content: trimmed,
    });
    
  if (error) {
    console.error("Not ekleme hatası:", error);
    throw new Error(`Not eklenemedi: ${error.message}`);
  }
  
  revalidatePath(`/product-groups/${groupId}`);
}

export async function updateProductGroupNote(id: string, groupId: string, content: string) {
  await requireAdminRole();
  
  const trimmed = content?.trim();
  if (!id || !groupId || !trimmed) {
    throw new Error("Geçersiz parametreler.");
  }
  
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("product_group_notes")
    .update({
      content: trimmed,
    })
    .eq("id", id)
    .eq("group_id", groupId);
    
  if (error) {
    console.error("Not güncelleme hatası:", error);
    throw new Error(`Not güncellenemedi: ${error.message}`);
  }
  
  revalidatePath(`/product-groups/${groupId}`);
}

export async function deleteProductGroupNote(id: string, groupId: string) {
  await requireAdminRole();
  
  if (!id || !groupId) {
    throw new Error("Geçersiz parametreler.");
  }
  
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("product_group_notes")
    .delete()
    .eq("id", id)
    .eq("group_id", groupId);
    
  if (error) {
    console.error("Not silme hatası:", error);
    throw new Error(`Not silinemedi: ${error.message}`);
  }
  
  revalidatePath(`/product-groups/${groupId}`);
}

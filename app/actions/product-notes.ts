"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/roles";

export async function createProductNote(productId: string, content: string) {
  await requireAdminRole();
  
  const trimmed = content?.trim();
  if (!productId || !trimmed) {
    throw new Error("Ürün ID ve not içeriği zorunludur.");
  }
  
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("product_notes")
    .insert({
      product_id: productId,
      content: trimmed,
    });
    
  if (error) {
    console.error("Not ekleme hatası:", error);
    throw new Error(`Not eklenemedi: ${error.message}`);
  }
  
  revalidatePath(`/products/${productId}`);
}

export async function updateProductNote(id: string, productId: string, content: string) {
  await requireAdminRole();
  
  const trimmed = content?.trim();
  if (!id || !productId || !trimmed) {
    throw new Error("Geçersiz parametreler.");
  }
  
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("product_notes")
    .update({
      content: trimmed,
    })
    .eq("id", id)
    .eq("product_id", productId);
    
  if (error) {
    console.error("Not güncelleme hatası:", error);
    throw new Error(`Not güncellenemedi: ${error.message}`);
  }
  
  revalidatePath(`/products/${productId}`);
}

export async function deleteProductNote(id: string, productId: string) {
  await requireAdminRole();
  
  if (!id || !productId) {
    throw new Error("Geçersiz parametreler.");
  }
  
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("product_notes")
    .delete()
    .eq("id", id)
    .eq("product_id", productId);
    
  if (error) {
    console.error("Not silme hatası:", error);
    throw new Error(`Not silinemedi: ${error.message}`);
  }
  
  revalidatePath(`/products/${productId}`);
}

import { createClient } from "@/lib/supabase/server";
import { ProdutosClient, ProdutoItem } from "./produtos-client";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const supabase = await createClient();

  const { data: produtos } = await supabase
    .from("produtos")
    .select("*, categoria:categorias(nome)")
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true });

  return <ProdutosClient initialProdutos={(produtos as ProdutoItem[]) || []} />;
}

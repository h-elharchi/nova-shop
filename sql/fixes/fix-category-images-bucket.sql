-- fix-category-images-bucket.sql
-- Bucket de stockage pour les images de catégories, sur le même modèle que
-- le bucket "avatars" (supabase-accounts.sql). Jusqu'ici, le champ image des
-- catégories n'acceptait qu'une URL saisie à la main, aucun upload possible.
--
-- Lecture publique (les images de catégories s'affichent sur le site client :
-- Accueil, page Catégories), écriture réservée aux admins.
--
-- Exécuter dans Supabase SQL Editor.

INSERT INTO storage.buckets (id, name, public)
VALUES ('category-images', 'category-images', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view category images" ON storage.objects;
CREATE POLICY "Public can view category images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'category-images');

DROP POLICY IF EXISTS "Admins can upload category images" ON storage.objects;
CREATE POLICY "Admins can upload category images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'category-images' AND is_admin());

DROP POLICY IF EXISTS "Admins can update category images" ON storage.objects;
CREATE POLICY "Admins can update category images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'category-images' AND is_admin());

DROP POLICY IF EXISTS "Admins can delete category images" ON storage.objects;
CREATE POLICY "Admins can delete category images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'category-images' AND is_admin());

-- Migrasi 0049 menambahkan modul ke paket Pro dengan `||` sehingga beberapa kunci tercatat ganda. Rapikan, urutan dipertahankan.
UPDATE plan_preset p
SET modules = COALESCE((
  SELECT jsonb_agg(m.key ORDER BY m.first_pos)
  FROM (
    SELECT elem AS key, MIN(ord) AS first_pos
    FROM jsonb_array_elements_text(p.modules) WITH ORDINALITY AS t(elem, ord)
    GROUP BY elem
  ) m
), '[]'::jsonb)
WHERE jsonb_array_length(p.modules) <> (SELECT count(DISTINCT e) FROM jsonb_array_elements_text(p.modules) AS e);

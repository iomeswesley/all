insert into public.categories (id, slug, name) values
  (1,  'mercado',      'Alimentação (mercado)'),
  (2,  'restaurante',  'Alimentação (restaurante/delivery)'),
  (3,  'transporte',   'Transporte/combustível'),
  (4,  'assinaturas',  'Assinaturas'),
  (5,  'saude',        'Saúde'),
  (6,  'casa',         'Casa'),
  (7,  'compras',      'Compras/varejo'),
  (8,  'lazer',        'Lazer'),
  (9,  'educacao',     'Educação'),
  (10, 'viagem',       'Viagem'),
  (11, 'servicos',     'Serviços/tarifas'),
  (12, 'outros',       'Outros')
on conflict (id) do update set slug = excluded.slug, name = excluded.name;

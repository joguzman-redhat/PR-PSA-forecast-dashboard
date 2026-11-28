SELECT json_build_object(
  'relations', coalesce((SELECT json_agg(row_to_json(r) ORDER BY r.name, r.kind)
    FROM (SELECT c.relname AS name, c.relkind AS kind,
      (SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
         FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
      CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,false) END AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')) r), '[]'::json),
  'constraints', coalesce((SELECT json_agg(row_to_json(r) ORDER BY r.relation,r.name)
    FROM (SELECT c.conrelid::regclass::text AS relation,c.conname AS name,pg_get_constraintdef(c.oid,false) AS definition
      FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public') r), '[]'::json),
  'functions', coalesce((SELECT json_agg(row_to_json(r) ORDER BY r.name,r.arguments)
    FROM (SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')) r), '[]'::json),
  'indexes', coalesce((SELECT json_agg(row_to_json(r) ORDER BY r.name)
    FROM (SELECT indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname='public') r), '[]'::json),
  'triggers', coalesce((SELECT json_agg(row_to_json(r) ORDER BY r.relation,r.name)
    FROM (SELECT t.tgrelid::regclass::text AS relation,t.tgname AS name,pg_get_triggerdef(t.oid,false) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND NOT t.tgisinternal) r), '[]'::json)
)::text AS fingerprint;

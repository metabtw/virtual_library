-- Run after creating library_reward_worker_url and library_reward_worker_secret in Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'library-rewards',
  '* * * * *',
  $job$
    select net.http_post(
      url := worker.decrypted_secret,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', secret.decrypted_secret),
      timeout_milliseconds := 15000
    )
    from vault.decrypted_secrets worker
    cross join vault.decrypted_secrets secret
    where worker.name = 'library_reward_worker_url'
      and secret.name = 'library_reward_worker_secret';
  $job$
);

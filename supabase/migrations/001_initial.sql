create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null default 'CF-Daily user',
    photo_url text,
    current_streak integer not null default 0,
    longest_streak integer not null default 0,
    total_active_days integer not null default 0,
    total_completions integer not null default 0,
    last_active_day date,
    updated_at timestamptz not null default now()
);

create table public.activity (
    user_id uuid not null references public.profiles(id) on delete cascade,
    day date not null,
    rating integer not null check (rating between 800 and 3500 and rating % 100 = 0),
    problem_key text not null check (problem_key ~ '^[0-9]+-[A-Za-z0-9]+$'),
    completed_at bigint not null check (completed_at > 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, day, rating)
);

alter table public.profiles enable row level security;
alter table public.activity enable row level security;

create policy "users read own profile" on public.profiles
    for select using (auth.uid() = id);
create policy "users read own activity" on public.activity
    for select using (auth.uid() = user_id);

create or replace function public.sync_activity(p_user_id uuid, p_completions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    item jsonb;
    streak_stats record;
begin
    for item in select * from jsonb_array_elements(p_completions)
    loop
        insert into public.activity (user_id, day, rating, problem_key, completed_at)
        values (
            p_user_id,
            (item->>'day')::date,
            (item->>'rating')::integer,
            item->>'problem_key',
            (item->>'completed_at')::bigint
        )
        on conflict (user_id, day, rating) do update
        set problem_key = excluded.problem_key,
            completed_at = least(public.activity.completed_at, excluded.completed_at),
            updated_at = now();
    end loop;

    with distinct_days as (
        select distinct day from public.activity where user_id = p_user_id
    ), grouped as (
        select day, day - (row_number() over (order by day))::integer as island from distinct_days
    ), runs as (
        select min(day) as first_day, max(day) as last_day, count(*)::integer as length
        from grouped group by island
    )
    select
        coalesce(max(length), 0) as longest_streak,
        coalesce(max(length) filter (
            where last_day >= (now() at time zone 'utc')::date - 1
        ), 0) as current_streak,
        coalesce((select count(*) from distinct_days), 0) as total_active_days,
        max(last_day) as last_active_day
    into streak_stats
    from runs;

    update public.profiles set
        longest_streak = streak_stats.longest_streak,
        current_streak = streak_stats.current_streak,
        total_active_days = streak_stats.total_active_days,
        total_completions = (select count(*) from public.activity where user_id = p_user_id),
        last_active_day = streak_stats.last_active_day,
        updated_at = now()
    where id = p_user_id;
end;
$$;

revoke all on function public.sync_activity(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_activity(uuid, jsonb) to service_role;

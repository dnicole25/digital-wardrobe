-- Dana's Digital Wardrobe — Supabase Schema
-- Run this in the Supabase SQL editor

create table wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  name text,
  category text,
  color text,
  size text,
  source text,
  url text,
  image_url text,
  occasions text[],
  seasons text[],
  created_at timestamptz default now()
);

create table wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  name text,
  category text,
  color text,
  size text,
  source text,
  url text,
  image_url text,
  occasions text[],
  seasons text[],
  created_at timestamptz default now()
);

create table saved_outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  occasion text,
  time_of_day text,
  date text,
  notes text,
  outfit_slots jsonb,
  created_at timestamptz default now()
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  name text,
  destination text,
  start_date date,
  end_date date,
  days jsonb,
  created_at timestamptz default now()
);

create table inspiration_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  image_url text,
  source text,
  pinterest_url text,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table wardrobe_items enable row level security;
alter table wishlist_items enable row level security;
alter table saved_outfits enable row level security;
alter table trips enable row level security;
alter table inspiration_images enable row level security;

-- RLS Policies
create policy "Users own wardrobe items" on wardrobe_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own wishlist items" on wishlist_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own saved outfits" on saved_outfits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own trips" on trips for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own inspiration images" on inspiration_images for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table outfit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  date date not null,
  weekday text not null,
  occasion text,
  outfit_slots jsonb,
  notes text,
  created_at timestamptz default now()
);

alter table outfit_log enable row level security;
create policy "Users own outfit log" on outfit_log for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage bucket (run separately or via Supabase dashboard)
-- Create a public bucket called 'wardrobe-images'
-- Add storage policy: allow authenticated users to upload to their own folder

-- Optional: if you want a dedicated occasion column on trips
-- (occasion is currently stored per-day inside the days jsonb, so this column is not strictly required)
-- ALTER TABLE trips ADD COLUMN IF NOT EXISTS occasion text;

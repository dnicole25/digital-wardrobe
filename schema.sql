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

create table wishlist_prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  item_id uuid references wishlist_items(id) on delete cascade,
  store text not null,
  price numeric(10,2) not null,
  url text,
  recorded_at timestamptz default now()
);

alter table wishlist_prices enable row level security;
create policy "Users own wishlist prices" on wishlist_prices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index wishlist_prices_item_idx on wishlist_prices(item_id, recorded_at desc);

-- Storage bucket (run separately or via Supabase dashboard)
-- Create a public bucket called 'wardrobe-images'
-- Add storage policy: allow authenticated users to upload to their own folder

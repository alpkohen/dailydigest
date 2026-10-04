-- Listing-page sources ('scrape'): which links on the listing page are
-- articles, as a regular expression over the link's path.
alter table sources add column link_pattern text;

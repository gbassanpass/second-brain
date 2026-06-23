import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StudioRoom } from '../../../components/StudioRoom';
import { fetchCreator } from '../../../lib/api';

type Params = { slug: string };

export const metadata: Metadata = { title: 'Studio' };

export default async function StudioPage({ params }: { params: Params }) {
  // Public creator lookup just for the header name; the Studio data itself is
  // fetched client-side with the user's token and gated by role (E6.4).
  const creator = await fetchCreator(params.slug);
  if (!creator) notFound();
  return <StudioRoom slug={creator.slug} displayName={creator.displayName} />;
}

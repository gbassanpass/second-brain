import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChatRoom } from '../../../../components/ChatRoom';
import { fetchCreator } from '../../../../lib/api';
import { buildLandingView } from '../../../../lib/creator';

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const creator = await fetchCreator(params.slug);
  if (!creator) return { title: 'Criador não encontrado' };
  return { title: `Conversar com ${creator.displayName}` };
}

export default async function ChatPage({ params }: { params: Params }) {
  const creator = await fetchCreator(params.slug);
  if (!creator) notFound();
  const view = buildLandingView(creator);
  return <ChatRoom view={view} />;
}

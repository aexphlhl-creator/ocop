export interface OcopEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  summary?: string | null;
  banner?: string | null;
  coverImage?: string | null;
  location?: string | null;
  organizer?: string | null;
  eventType?: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
  registrationDeadline?: string | null;
  registrationRequired: boolean;
  currentParticipants: number;
  maxParticipants?: number | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isPublic: boolean;
  isFeatured: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
}

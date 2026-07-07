import { PrismaClient, OcopLevel } from '@prisma/client';

export async function seedOcopLevels(prisma: PrismaClient): Promise<Record<number, OcopLevel>> {
  const levelsData = [
    { level: 3, title: '3 Sao OCOP', color: '#3498db', icon: 'star-3' },
    { level: 4, title: '4 Sao OCOP', color: '#e67e22', icon: 'star-4' },
    { level: 5, title: '5 Sao OCOP', color: '#f1c40f', icon: 'star-5' },
  ];

  const levelsMap: Record<number, OcopLevel> = {};
  for (const l of levelsData) {
    const createdLevel = await prisma.ocopLevel.upsert({
      where: { level: l.level },
      update: {
        title: l.title,
        color: l.color,
        icon: l.icon,
      },
      create: l,
    });
    levelsMap[l.level] = createdLevel;
  }
  return levelsMap;
}

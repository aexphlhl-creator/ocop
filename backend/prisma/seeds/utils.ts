import * as fs from 'fs';
import * as path from 'path';

export function generateGeoJSONAndGetPath(
  type: 'provinces' | 'wards',
  codeOrId: string,
  lat: number,
  lon: number,
  delta = 0.05
): { path: string; bounds: any } {
  const relativeDir = path.join('assets', 'geojson', type);
  const absoluteDir = path.join(process.cwd(), relativeDir);
  
  if (!fs.existsSync(absoluteDir)) {
    fs.mkdirSync(absoluteDir, { recursive: true });
  }

  const geojson = {
    type: 'Feature',
    properties: { id: codeOrId },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lon - delta, lat - delta],
          [lon + delta, lat - delta],
          [lon + delta, lat + delta],
          [lon - delta, lat + delta],
          [lon - delta, lat - delta],
        ],
      ],
    },
  };

  const fileName = `${codeOrId}.geojson`;
  const absoluteFilePath = path.join(absoluteDir, fileName);
  fs.writeFileSync(absoluteFilePath, JSON.stringify(geojson, null, 2));

  const clientPath = `/assets/geojson/${type}/${fileName}`;
  const bounds = [
    [lat - delta, lon - delta],
    [lat + delta, lon + delta],
  ];

  return { path: clientPath, bounds };
}

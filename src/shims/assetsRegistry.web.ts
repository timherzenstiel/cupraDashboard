// react-native-svg's browser build asks React Native's asset registry for bundled images.
// This app draws no bundled images inside SVG, so an empty registry is enough on the web.
export function getAssetByID(_id: number): undefined {
  return undefined;
}
export function registerAsset(): number {
  return 0;
}

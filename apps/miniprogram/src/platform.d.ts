import 'vue';
type UniPlatformAPI = typeof uni;
declare module 'vue' {
  interface ComponentCustomProperties {
    uni: UniPlatformAPI;
  }
}

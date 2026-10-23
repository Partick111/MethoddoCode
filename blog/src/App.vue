<script setup lang="ts">
import AppLayout from '@/layout/AppLayout.vue'
</script>

<template>
  <AppLayout>
    <RouterView v-slot="{ Component }">
      <Transition name="route-fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </AppLayout>
</template>

<style scoped>
.route-fade-enter-active,
.route-fade-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.route-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.route-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

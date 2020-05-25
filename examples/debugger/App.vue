<template>
  <div>
    hello, {{ name }}
  </div>
</template>

<script>
export default {
  name: 'App',
  computed: {
    name() {
      return this.$store.state.name;
    }
  },
  mounted() {
    console.log(this.$store);
  }
}
</script>

<style scoped>

</style>

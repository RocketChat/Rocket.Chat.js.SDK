// PROTOTYPE — throwaway.
module.exports = {
  projectRoot: __dirname,
  cacheStores: [],
  resolver: {
    sourceExts: ['ts', 'tsx', 'js', 'json'],
    unstable_enablePackageExports: true,
  },
  transformer: {
    babelTransformerPath: require.resolve('metro-babel-transformer'),
  },
  serializer: {},
};

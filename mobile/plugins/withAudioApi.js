const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withGradleProperties,
  withInfoPlist,
  withPodfile,
} = require("expo/config-plugins");

const pkg = require("react-native-audio-api/package.json");

function withDefaultOptions(options) {
  return {
    iosBackgroundMode: true,
    androidPermissions: ["android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"],
    androidForegroundService: true,
    androidFSTypes: ["mediaPlayback"],
    disableFFmpeg: false,
    disableStaticExternalLibs: false,
    ...options,
  };
}

function withBackgroundAudio(config) {
  return withInfoPlist(config, (iosConfig) => {
    iosConfig.modResults.UIBackgroundModes = [
      ...Array.from(new Set([...(iosConfig.modResults.UIBackgroundModes ?? []), "audio"])),
    ];
    return iosConfig;
  });
}

function withIosMicrophonePermission(config, { iosMicrophonePermission }) {
  return withInfoPlist(config, (iosConfig) => {
    iosConfig.modResults.NSMicrophoneUsageDescription = iosMicrophonePermission;
    return iosConfig;
  });
}

function withAndroidPermissions(config, { androidPermissions }) {
  return AndroidConfig.Permissions.withPermissions(config, androidPermissions);
}

function withForegroundService(config, { androidFSTypes }) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const foregroundServiceTypes = androidFSTypes.join("|");
    const serviceElement = {
      $: {
        "android:name": "com.swmansion.audioapi.system.CentralizedForegroundService",
        "android:stopWithTask": "true",
        "android:foregroundServiceType": foregroundServiceTypes,
      },
      intentFilter: [],
    };

    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const existingServiceIndex = mainApplication.service.findIndex((service) =>
      service.$["android:name"].includes(serviceElement.$["android:name"]),
    );

    if (existingServiceIndex !== -1) {
      mainApplication.service[existingServiceIndex] = serviceElement;
      return mod;
    }

    mainApplication.service.push(serviceElement);
    return mod;
  });
}

function withFFmpegConfig(config, options) {
  const iosConfig = withPodfile(config, (mod) => {
    let contents = mod.modResults.contents;
    const ffmpegRegex = /^.*ENV\['DISABLE_AUDIOAPI_FFMPEG'\].*$/gm;
    const podfileString = options.disableFFmpeg ? "ENV['DISABLE_AUDIOAPI_FFMPEG'] = '1'" : "";

    if (contents.search(ffmpegRegex) === -1) {
      if (options.disableFFmpeg) {
        contents = contents.endsWith("\n") ? `${contents}${podfileString}` : `${contents}\n${podfileString}`;
      }
    } else {
      contents = contents.replace(ffmpegRegex, podfileString);
    }

    mod.modResults.contents = contents;
    return mod;
  });

  return withGradleProperties(iosConfig, (mod) => {
    const gradleProperties = mod.modResults;
    const existingIndex = gradleProperties.findIndex(
      (prop) => prop.type === "property" && prop.key === "disableAudioapiFFmpeg",
    );

    if (existingIndex !== -1) {
      gradleProperties.splice(existingIndex, 1);
    } else if (!options.disableFFmpeg) {
      return mod;
    }

    if (options.disableFFmpeg) {
      gradleProperties.push({
        type: "property",
        key: "disableAudioapiFFmpeg",
        value: "true",
      });
    }

    return mod;
  });
}

function withStaticExternalLibsConfig(config, options) {
  const iosConfig = withPodfile(config, (mod) => {
    let contents = mod.modResults.contents;
    const staticLibsRegex = /^.*ENV\['DISABLE_AUDIOAPI_STATIC_EXTERNAL_LIBS'\].*$/gm;
    const podfileString = options.disableStaticExternalLibs
      ? "ENV['DISABLE_AUDIOAPI_STATIC_EXTERNAL_LIBS'] = '1'"
      : "";

    if (contents.search(staticLibsRegex) === -1) {
      if (options.disableStaticExternalLibs) {
        contents = contents.endsWith("\n") ? `${contents}${podfileString}` : `${contents}\n${podfileString}`;
      }
    } else {
      contents = contents.replace(staticLibsRegex, podfileString);
    }

    mod.modResults.contents = contents;
    return mod;
  });

  return withGradleProperties(iosConfig, (mod) => {
    const gradleProperties = mod.modResults;
    const existingIndex = gradleProperties.findIndex(
      (prop) => prop.type === "property" && prop.key === "disableAudioapiStaticExternalLibs",
    );

    if (existingIndex !== -1) {
      gradleProperties.splice(existingIndex, 1);
    } else if (!options.disableStaticExternalLibs) {
      return mod;
    }

    if (options.disableStaticExternalLibs) {
      gradleProperties.push({
        type: "property",
        key: "disableAudioapiStaticExternalLibs",
        value: "true",
      });
    }

    return mod;
  });
}

function withAudioApi(config, optionsIn) {
  const options = withDefaultOptions(optionsIn ?? {});

  if (options.iosBackgroundMode) {
    config = withBackgroundAudio(config);
  }

  config = withAndroidPermissions(config, options);

  if (options.androidForegroundService) {
    config = withForegroundService(config, options);
  }

  if (options.iosMicrophonePermission) {
    config = withIosMicrophonePermission(config, options);
  }

  if (options.disableFFmpeg !== undefined) {
    config = withFFmpegConfig(config, options);
  }

  if (options.disableStaticExternalLibs !== undefined) {
    config = withStaticExternalLibsConfig(config, options);
  }

  return config;
}

module.exports = createRunOncePlugin(withAudioApi, pkg.name, pkg.version);

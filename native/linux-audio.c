/* Latitude, MIT. A control-only PulseAudio/PipeWire bridge. Audio stays in the
 * audio server and Chromium; no PCM is copied through Electron IPC. */
#include <pulse/pulseaudio.h>
#include <pulse/mainloop-signal.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/time.h>

static pa_mainloop *loop;
static pa_context *context;
static pa_mainloop_api *api;
static pa_time_event *deadline;
static const char *sink_name, *source_name;
static char *default_sink;
static uint32_t module_id = PA_INVALID_INDEX;
static uint32_t selected_sink = PA_INVALID_INDEX;
static int listing, first = 1, stopping, loading, ready;

static void json_string(const char *s) {
    putchar('"');
    for (const unsigned char *p = (const unsigned char *)(s ? s : ""); *p; ++p) {
        if (*p == '"' || *p == '\\') { putchar('\\'); putchar(*p); }
        else if (*p < 32) printf("\\u%04x", *p);
        else putchar(*p);
    }
    putchar('"');
}
static void fail(const char *message) {
    fprintf(stderr, "%s: %s\n", message, pa_strerror(pa_context_errno(context)));
    api->quit(api, 1);
}
static void released(pa_context *c, int success, void *data) {
    (void)c; (void)data;
    if (!success) fprintf(stderr, "Could not unload the desktop audio bridge.\n");
    api->quit(api, success ? 0 : 1);
}
static void stop(void) {
    stopping = 1;
    if (loading) return;
    if (module_id != PA_INVALID_INDEX) {
        uint32_t id = module_id;
        module_id = PA_INVALID_INDEX;
        pa_operation *op = pa_context_unload_module(context, id, released, NULL);
        if (op) pa_operation_unref(op); else fail("Could not release desktop audio");
    } else api->quit(api, 0);
}
static void stdin_event(pa_mainloop_api *a, pa_io_event *e, int fd,
                        pa_io_event_flags_t flags, void *data) {
    (void)flags; (void)data;
    char discard[32];
    if (read(fd, discard, sizeof(discard)) <= 0) {
        a->io_free(e);
        stop();
    }
}
static void quit_signal(pa_mainloop_api *a, pa_signal_event *e, int sig, void *data) {
    (void)a; (void)e; (void)sig; (void)data;
    stop();
}
static void subscription(pa_context *c, pa_subscription_event_type_t type, uint32_t index, void *data) {
    (void)c; (void)data;
    if ((type & PA_SUBSCRIPTION_EVENT_FACILITY_MASK) == PA_SUBSCRIPTION_EVENT_SINK &&
        (type & PA_SUBSCRIPTION_EVENT_TYPE_MASK) == PA_SUBSCRIPTION_EVENT_REMOVE &&
        index == selected_sink && !stopping) {
        fprintf(stderr, "The selected audio output disconnected. Choose an output again in Inputs & outputs.\n");
        stop();
    }
}
static void timed_out(pa_mainloop_api *a, pa_time_event *e,
                      const struct timeval *tv, void *data) {
    (void)a; (void)e; (void)tv; (void)data;
    fail("Desktop audio server timed out");
}
static void loaded(pa_context *c, uint32_t index, void *data) {
    (void)c; (void)data;
    loading = 0;
    if (index == PA_INVALID_INDEX) { fail("Cannot create desktop audio input"); return; }
    module_id = index;
    if (stopping) { stop(); return; }
    ready = 1;
    api->time_free(deadline);
    deadline = NULL;
    printf("{\"sourceName\":"); json_string(source_name);
    printf(",\"label\":"); json_string(source_name);
    puts("}"); fflush(stdout);
}
/* Module arguments are not a shell command, but still need PulseAudio quoting. */
static char *quote(const char *s) {
    size_t n = strlen(s);
    char *out = malloc(n * 2 + 3), *p = out;
    if (!out) return NULL;
    *p++ = '"';
    for (; *s; ++s) { if (*s == '"' || *s == '\\') *p++ = '\\'; *p++ = *s; }
    *p++ = '"'; *p = 0;
    return out;
}
static void sink_info(pa_context *c, const pa_sink_info *info, int end, void *data) {
    (void)data;
    if (end < 0) { fail("Audio output is unavailable"); return; }
    if (end) {
        if (listing) { puts("]"); fflush(stdout); api->quit(api, 0); }
        return;
    }
    if (!info) return;
    if (listing) {
        if (!first) putchar(',');
        first = 0;
        printf("{\"name\":"); json_string(info->name);
        printf(",\"description\":"); json_string(info->description);
        printf(",\"isDefault\":%s}", default_sink && !strcmp(default_sink, info->name) ? "true" : "false");
        return;
    }
    if (stopping) { stop(); return; }
    if (!info->monitor_source_name) { fail("Audio output has no monitor"); return; }
    selected_sink = info->index;
    char *master = quote(info->monitor_source_name);
    if (!master) { fail("Out of memory"); return; }
    size_t length = strlen(master) + strlen(source_name) * 2 + 512;
    char *args = malloc(length);
    if (!args) { free(master); fail("Out of memory"); return; }
    snprintf(args, length,
        "master=%s source_name=%s source_properties=\"device.description=%s device.class=filter priority.session=0\" "
        "format=float32le rate=48000 channels=2 channel_map=front-left,front-right remix=yes",
        master, source_name, source_name);
    loading = 1;
    pa_operation *op = pa_context_load_module(c, "module-remap-source", args, loaded, NULL);
    free(args); free(master);
    if (op) pa_operation_unref(op); else { loading = 0; fail("Could not request desktop audio"); }
}
static void server_info(pa_context *c, const pa_server_info *info, void *data) {
    (void)data;
    if (!info) { fail("Cannot read audio server"); return; }
    /* Older PipeWire accepted .monitor masters but never linked their ports.
     * Refuse that silent-success case; PulseAudio itself is unaffected. */
    const char *pw = info->server_name ? strstr(info->server_name, "PipeWire ") : NULL;
    unsigned int major = 0, minor = 0, patch = 0;
    if (!listing && pw && sscanf(pw + 9, "%u.%u.%u", &major, &minor, &patch) == 3 &&
        major == 0 && (minor < 3 || (minor == 3 && patch < 65))) {
        fprintf(stderr, "Desktop audio requires PipeWire 0.3.65 or newer. Update your distribution's audio service, or choose a separate loopback input.\n");
        api->quit(api, 1);
        return;
    }
    default_sink = info->default_sink_name ? strdup(info->default_sink_name) : NULL;
    pa_operation *op;
    if (listing) { putchar('['); op = pa_context_get_sink_info_list(c, sink_info, NULL); }
    else {
        const char *target = strcmp(sink_name, "default") ? sink_name : default_sink;
        if (!target) { fail("No default audio output"); return; }
        op = pa_context_get_sink_info_by_name(c, target, sink_info, NULL);
    }
    if (op) pa_operation_unref(op); else fail("Cannot enumerate audio outputs");
}
static void state_changed(pa_context *c, void *data) {
    (void)data;
    switch (pa_context_get_state(c)) {
    case PA_CONTEXT_READY: {
        if (stopping) { stop(); return; }
        if (!listing) {
            pa_operation *subscribe = pa_context_subscribe(c, PA_SUBSCRIPTION_MASK_SINK, NULL, NULL);
            if (subscribe) pa_operation_unref(subscribe);
        }
        pa_operation *op = pa_context_get_server_info(c, server_info, NULL);
        if (op) pa_operation_unref(op); else fail("Cannot query audio server");
        break;
    }
    case PA_CONTEXT_FAILED: fail(ready ? "Desktop audio disconnected" : "Cannot connect to PipeWire/PulseAudio"); break;
    case PA_CONTEXT_TERMINATED: api->quit(api, 0); break;
    default: break;
    }
}
int main(int argc, char **argv) {
    if (argc == 2 && !strcmp(argv[1], "list")) listing = 1;
    else if (argc == 4 && !strcmp(argv[1], "bridge")) {
        sink_name = argv[2]; source_name = argv[3];
        if (strlen(sink_name) > 1024 || strlen(source_name) > 100 ||
            strncmp(source_name, "latitude_desktop_", 17) ||
            strspn(source_name, "abcdefghijklmnopqrstuvwxyz0123456789_") != strlen(source_name)) return 2;
    } else { fprintf(stderr, "Usage: latitude-audio list | bridge OUTPUT SOURCE\n"); return 2; }
    loop = pa_mainloop_new();
    if (!loop) return 1;
    api = pa_mainloop_get_api(loop);
    signal(SIGPIPE, SIG_IGN);
    pa_signal_init(api);
    pa_signal_new(SIGTERM, quit_signal, NULL);
    pa_signal_new(SIGINT, quit_signal, NULL);
    context = pa_context_new(api, "Latitude desktop audio");
    if (!context) { pa_mainloop_free(loop); return 1; }
    pa_context_set_state_callback(context, state_changed, NULL);
    pa_context_set_subscribe_callback(context, subscription, NULL);
    struct timeval timeout;
    gettimeofday(&timeout, NULL); timeout.tv_sec += 10;
    deadline = api->time_new(api, &timeout, timed_out, NULL);
    if (!listing) api->io_new(api, STDIN_FILENO, PA_IO_EVENT_INPUT | PA_IO_EVENT_HANGUP, stdin_event, NULL);
    int result = 1;
    if (pa_context_connect(context, NULL, PA_CONTEXT_NOAUTOSPAWN, NULL) < 0)
        fprintf(stderr, "Cannot connect to PipeWire/PulseAudio: %s\n", pa_strerror(pa_context_errno(context)));
    else pa_mainloop_run(loop, &result);
    pa_context_disconnect(context); pa_context_unref(context); pa_signal_done(); pa_mainloop_free(loop);
    free(default_sink);
    return result;
}

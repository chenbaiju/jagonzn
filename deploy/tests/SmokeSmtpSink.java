import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import java.util.concurrent.Executors;

/** Only for the isolated Compose SMTP test: capture messages without exposing a host port. */
public final class SmokeSmtpSink {
    public static void main(String[] args) throws Exception {
        Path capture = Path.of("/capture");
        Files.createDirectories(capture);
        try (ServerSocket server = new ServerSocket(1025);
             var clients = Executors.newVirtualThreadPerTaskExecutor()) {
            System.out.println("test SMTP sink listening on internal port 1025");
            while (true) {
                Socket socket = server.accept();
                clients.submit(() -> handle(socket, capture));
            }
        }
    }

    private static void handle(Socket socket, Path capture) {
        try (socket;
             BufferedReader input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.ISO_8859_1));
             BufferedWriter output = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.ISO_8859_1))) {
            reply(output, "220 smtp-sink.local ESMTP");
            StringBuilder message = null;
            String line;
            while ((line = input.readLine()) != null) {
                if (message != null) {
                    if (line.equals(".")) {
                        Path file = capture.resolve("message-" + UUID.randomUUID() + ".eml");
                        Files.writeString(file, message.toString(), StandardCharsets.ISO_8859_1,
                                StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
                        System.out.println("captured one test message");
                        message = null;
                        reply(output, "250 queued");
                    } else {
                        message.append(line.startsWith("..") ? line.substring(1) : line).append("\r\n");
                    }
                } else if (line.startsWith("EHLO ") || line.startsWith("HELO ")) {
                    reply(output, "250-smtp-sink.local\r\n250 8BITMIME");
                } else if (line.startsWith("MAIL FROM:") || line.startsWith("RCPT TO:") || line.equals("RSET")) {
                    reply(output, "250 OK");
                } else if (line.equals("DATA")) {
                    message = new StringBuilder();
                    reply(output, "354 End data with <CR><LF>.<CR><LF>");
                } else if (line.equals("NOOP")) {
                    reply(output, "250 OK");
                } else if (line.equals("QUIT")) {
                    reply(output, "221 Bye");
                    break;
                } else {
                    reply(output, "502 Command not implemented");
                }
            }
        } catch (Exception failure) {
            System.err.println("test SMTP client failed: " + failure.getClass().getSimpleName());
        }
    }

    private static void reply(BufferedWriter output, String response) throws Exception {
        output.write(response);
        output.write("\r\n");
        output.flush();
    }
}

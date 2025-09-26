
#include <unistd.h>

int main(void)
{
	char* args[3];
	args[0] = "cat";
	args[1] = "/dev/random";
	args[2] = 0;
	execvp("cat", args);
}

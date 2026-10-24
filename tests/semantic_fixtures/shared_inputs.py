"""External context used by unequal ordinary source regions."""
from torch import nn


class SharedInputPaths(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(4, 4)
        self.second = nn.Linear(4, 4)
        self.third = nn.Linear(4, 4)
        self.fourth = nn.Linear(4, 4)

    def left_path(self, left, context):
        x = self.first(left).contiguous()
        return self.second(x) + context

    def right_path(self, right, context):
        x = self.third(right).contiguous()
        x = self.fourth(x).contiguous()
        return x.contiguous() + context

    def forward(self, left, right, context):
        a = self.left_path(left, context)
        b = self.right_path(right, context)
        return a + b

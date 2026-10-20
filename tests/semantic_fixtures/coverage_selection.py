"""Original algebra, convolution, vector and context composition examples."""
import math
import torch
from torch import nn


def combine_values(a, b, c):
    scores = torch.matmul(a, b.transpose(-2, -1)) / math.sqrt(a.size(-1))
    weights = torch.softmax(scores, dim=-1)
    return torch.matmul(weights, c)


class ProjectedMixer(nn.Module):
    def __init__(self, width=8, parts=2):
        super().__init__()
        self.parts = parts
        self.chunk = width // parts
        self.left = nn.Linear(width, width)
        self.right = nn.Linear(width, width)
        self.signal = nn.Linear(width, width)
        self.finish = nn.Linear(width, width)

    def divide(self, x):
        batch, length, _ = x.shape
        return x.view(batch, length, self.parts, self.chunk).transpose(1, 2).contiguous()

    def collect(self, x):
        batch, parts, length, chunk = x.shape
        return x.transpose(1, 2).contiguous().view(batch, length, parts * chunk)

    def forward(self, x, context, values):
        a = self.divide(self.left(x))
        b = self.divide(self.right(context))
        c = self.divide(self.signal(values))
        result = combine_values(a, b, c)
        return self.finish(self.collect(result))


class MixedWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.mixer = ProjectedMixer()

    def reused(self, x):
        value = torch.sigmoid(x)
        return torch.sin(value) - torch.cos(value)

    def forward(self, x, side):
        a = self.reused(x)
        b = self.reused(side)
        return self.mixer(a, b, b) + a


class InterruptedWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.mixer = ProjectedMixer()

    def reused(self, x):
        value = torch.sigmoid(x)
        return torch.sin(value) - torch.cos(value)

    def forward(self, x, side):
        a = self.reused(x)
        foreign = unknown_bridge(side)
        return self.mixer(a, foreign, foreign) + a


class UncertifiedWeave(nn.Module):
    def reused(self, x):
        value = torch.sigmoid(x)
        return torch.sin(value) - torch.cos(value)

    def tangled(self, x, side):
        a = torch.sin(x)
        b = torch.cos(side)
        return torch.tanh(a) - b - a

    def forward(self, x, side, flag):
        a = self.reused(x)
        if flag:
            b = self.tangled(a, side)
        else:
            b = unknown_bridge(a)
        return b + a

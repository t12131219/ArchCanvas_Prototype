"""Original algebra, convolution, vector and context composition examples."""
import math
import torch
from torch import nn


def combine_values(a, b, c):
    scores = torch.matmul(a, b.transpose(-2, -1)) / math.sqrt(a.size(-1))
    weights = torch.softmax(scores, dim=-1)
    return torch.matmul(weights, c)


class CircuitAlias(nn.Module):
    def __init__(self, width=8, parts=2):
        super().__init__()
        self.parts = parts
        self.chunk = width // parts
        self.delta = nn.Linear(width, width)
        self.beta = nn.Linear(width, width)
        self.gamma = nn.Linear(width, width)
        self.finish = nn.Linear(width, width)

    def divide(self, x):
        batch, length, _ = x.shape
        return x.view(batch, length, self.parts, self.chunk).transpose(1, 2).contiguous()

    def collect(self, x):
        batch, parts, length, chunk = x.shape
        return x.transpose(1, 2).contiguous().view(batch, length, parts * chunk)

    def forward(self, x, context, values):
        a = self.divide(self.delta(x))
        b = self.divide(self.beta(context))
        c = self.divide(self.gamma(values))
        result = combine_values(a, b, c)
        return self.finish(self.collect(result))


class SameSource(nn.Module):
    def __init__(self):
        super().__init__()
        self.mixer = CircuitAlias()

    def forward(self, x):
        return self.mixer(x, x, x)


class TwoSources(nn.Module):
    def __init__(self):
        super().__init__()
        self.mixer = CircuitAlias()

    def forward(self, x, context):
        return self.mixer(x, context, context)


class VectorBlock(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 16)
        self.dropout = nn.Dropout(0.1)
        self.second = nn.Linear(16, 8)

    def forward(self, x):
        return self.second(self.dropout(torch.relu(self.first(x))))


class ImageResidual(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Conv2d(4, 4, 3, padding=1)
        self.second = nn.Conv2d(4, 4, 3, padding=1)
        self.norm = nn.BatchNorm2d(4)

    def forward(self, x):
        transformed = self.second(torch.relu(self.first(x)))
        return self.norm(x + transformed)


class VectorResidual(nn.Module):
    def __init__(self):
        super().__init__()
        self.norm = nn.LayerNorm(8)
        self.block = VectorBlock()

    def forward(self, x):
        return x + self.block(self.norm(x))


class ConditionalResidual(nn.Module):
    def __init__(self):
        super().__init__()
        self.delta = nn.Linear(8, 8)
        self.beta = nn.Linear(8, 8)

    def forward(self, x, other, flag):
        if flag:
            y = self.delta(x)
        else:
            y = self.beta(other)
        return x + y


class ChosenOutput(nn.Module):
    def forward(self, x, details=False):
        if details:
            return x, x.relu()
        return x


class ExplicitChoice(nn.Module):
    def __init__(self):
        super().__init__()
        self.block = ChosenOutput()

    def forward(self, x):
        return self.block(x, details=True)
